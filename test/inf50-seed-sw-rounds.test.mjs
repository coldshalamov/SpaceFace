// Circuit rounds that are not another quota: nodes, hold, collect, commander, reach,
// and an elite or challenge room that only raises the stake's pressure and purse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { circuitPanelLines } from '../src/ui/screens/crucibleDraft.js';
import { OBJECTIVE_WORDS, survivalHud } from '../src/ui/survivalHud.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';
import { NAMED_KILL_PRIORITY } from '../src/systems/survivalAnnounce.js';
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

test('seed 4242: later cohort slots name a different contract, and stage one defends its beacon', () => {
  const expectKind = { 1: 'cohort', 2: 'survive', 3: 'defend', 4: 'boss', 5: 'nodes', 6: 'survive', 7: 'hold', 8: 'boss', 9: 'collect', 10: 'survive', 11: 'commander', 12: 'boss', 13: 'reach', 14: 'survive', 15: 'escort', 16: 'boss' };
  for (const [wave, kind] of Object.entries(expectKind)) {
    const round = circuitRoundFor(runAt(Number(wave)), Number(wave));
    assert.equal(round.kind, kind, `wave ${wave}`);
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave: Number(wave), mode: 'swarm', circuitRound: round });
    assert.equal(plan.swarm.circuit.kind, kind);
    if (kind !== 'boss' && kind !== 'survive' && kind !== 'cohort') {
      assert.equal(plan.swarm.killTarget, 0, `${kind} does not end on a kill quota`);
      assert.equal(plan.swarm.boss, false, `${kind} is not a second champion`);
      const line = waveOpeningLine(Number(wave), plan);
      assert.match(line, /Defend the beacon|Escort the freighter|Destroy the hive nodes|Hold the zone|Collect the cores|Assassinate|Reach the gate/);
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
  assert.equal(OBJECTIVE_WORDS.defend, 'BEACON');
  assert.equal(OBJECTIVE_WORDS.escort, 'ESCORT');
  const escortPanel = circuitPanelLines(runAt(14));
  assert.match(escortPanel.next, /escort the freighter/);
  const defendPanel = circuitPanelLines(runAt(2));
  assert.match(defendPanel.next, /defend the beacon/);
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
  const plain = choices.filter((choice) => choice.kind === 'route' && !choice.fight && !choice.node);
  assert.equal(plain.length, 2);
  assert.equal(choices.filter((choice) => choice.kind === 'event').length, 1);
  assert.equal(choices.filter((choice) => choice.kind === 'service').length, 3);
  assert.equal(choices.filter((choice) => choice.node === 'mystery').length, 1);
  assert.equal(choices.length, 11);
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

test('seed 4242: a score toast fading does not take the arrow off the ring', () => {
  const previous = globalThis.document;
  const node = () => ({
    children: [], parentNode: null, isConnected: true, style: {}, dataset: {},
    className: '', id: '', hidden: false, textContent: '',
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild() {}, setAttribute() {}, getAttribute() { return null; },
  });
  const body = node();
  const head = node();
  globalThis.document = {
    body, head,
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return node(); },
  };
  const player = { id: 1, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  const entities = new Map([[player.id, player]]);
  const plan = {
    objective: { kind: 'hold' },
    swarm: { killTarget: 0, circuit: { kind: 'hold', zone: { x: 400, z: 72, radius: 44 } } },
  };
  const state = {
    mode: 'flight', simTime: 0, ui: {}, playerId: player.id, entities,
    run: {
      kind: 'survival', phase: 'active', ruleset: 'swarm', wave: 7, arenaId: ARENA,
      score: 10, credits: 0, level: 1, xp: 0,
    },
  };
  const bus = { on() { return () => {}; } };
  try {
    survivalHud.init({ state, bus, helpers: {} });
    survivalHud._onWavePlanned({ plan });
    survivalHud._onWaveProgress({ completionKind: 'hold', durationTicks: 600, remainingTicks: 500, found: 0, total: 600 });
    survivalHud._chain = 4;
    survivalHud._pushEarn('+10 SCORE');
    survivalHud.update(1 / 60, state);
    assert.match(survivalHud._dom.threatWord.textContent, /HOLD/);
    state.simTime = 10;
    survivalHud.update(1 / 60, state);
    assert.equal(survivalHud._earn, null);
    assert.equal(survivalHud._objectiveKind, 'hold');
    assert.equal(survivalHud._plan, plan);
    assert.equal(survivalHud._chain, 4);
    assert.match(survivalHud._dom.threatWord.textContent, /HOLD/);
    assert.match(survivalHud._dom.threatWord.textContent, /↑/);
  } finally {
    survivalHud.destroy();
    globalThis.document = previous;
  }
});

test('seed 4242: the hold and the gate draw the circle the ship stands in', () => {
  const factory = createVisualFactory();
  const mesh = factory.build({
    type: 'beacon', id: 'circuit-ring', radius: 8,
    data: { circuitMark: true, ringRadius: 44 },
  });
  const ring = mesh.getObjectByName('circuit-zone');
  assert.ok(ring, 'the zone is a circle, not only a post');
  const params = ring.geometry && ring.geometry.parameters;
  assert.ok(params, 'the circle has a radius');
  assert.ok(params.outerRadius >= 44 - 0.01 && params.outerRadius <= 44 + 0.01);
  const plain = factory.build({ type: 'beacon', id: 'lane', radius: 8, data: {} });
  assert.equal(plain.getObjectByName('circuit-zone'), undefined, 'an ordinary beacon stays a buoy');
});

test('seed 4242: a hive node is a sac, and the commander wears a ring', () => {
  const factory = createVisualFactory();
  const node = factory.build({
    type: 'ship', id: 'circuit-node', radius: 9,
    data: { circuitNode: true },
  });
  assert.ok(node.getObjectByName('circuit-node'), 'the node is a sac, not a fighter');
  const fighter = factory.build({
    type: 'ship', id: 'ordinary', radius: 9, data: {},
  });
  assert.equal(fighter.getObjectByName('circuit-node'), undefined, 'an ordinary ship stays a ship');
  const commander = factory.build({
    type: 'ship', id: 'circuit-commander', radius: 9,
    data: { circuitCommander: true, callsign: 'ADA VENN' },
  });
  assert.ok(commander.getObjectByName('circuit-commander'), 'the commander is marked');
  assert.equal(commander.getObjectByName('circuit-node'), undefined);
});

test('seed 4242: the commander line speaks over a line that is already up', () => {
  const queue = new VoiceQueue();
  queue.enqueue({ channel: 'story', text: 'A longer story line.', id: 'story', ttl: 8 }, 0);
  queue.step(0);
  assert.equal(queue.active.text, 'A longer story line.');
  queue.enqueue({
    channel: 'objective', text: `${CIRCUIT_COMMANDER_NAME} down`, id: 'down', ttl: 12,
    priority: NAMED_KILL_PRIORITY,
  }, 1000);
  queue.step(1000);
  assert.equal(queue.active.text, `${CIRCUIT_COMMANDER_NAME} down`);
});

test('seed 4242: the commander\'s name is on the glass', () => {
  const previous = globalThis.document;
  const node = () => ({
    children: [], parentNode: null, isConnected: true, style: {}, dataset: {},
    className: '', id: '', hidden: false, textContent: '',
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild() {}, setAttribute() {}, getAttribute() { return null; },
  });
  globalThis.document = {
    body: node(), head: node(),
    querySelector() { return null; },
    getElementById() { return null; },
    createElement() { return node(); },
  };
  const player = { id: 1, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  const commander = {
    id: 2, alive: true, type: 'ship', hull: 40, hullMax: 80,
    data: { circuitCommander: true, scanLabel: CIRCUIT_COMMANDER_NAME, callsign: CIRCUIT_COMMANDER_NAME },
  };
  const entities = new Map([[player.id, player], [commander.id, commander]]);
  const state = {
    mode: 'flight', simTime: 0, ui: {}, playerId: player.id, entities,
    run: {
      kind: 'survival', phase: 'active', ruleset: 'swarm', wave: 11, arenaId: ARENA,
      score: 0, credits: 0, level: 1, xp: 0,
    },
  };
  const bus = { on() { return () => {}; } };
  try {
    survivalHud.init({ state, bus, helpers: {} });
    survivalHud.update(1 / 60, state);
    assert.equal(survivalHud._dom.boss.hidden, false);
    assert.equal(survivalHud._dom.bossWord.textContent, CIRCUIT_COMMANDER_NAME);
  } finally {
    survivalHud.destroy();
    globalThis.document = previous;
  }
});
