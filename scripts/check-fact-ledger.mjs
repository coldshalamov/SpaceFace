#!/usr/bin/env node
// T8b backend gate: Fact Ledger.
//
// The revamp doc calls this `state.world.facts`, but the shipped runtime contract is
// `state.scenario.facts`: scenarioRuntime owns the ledger, branch effects mutate it, and the sim
// trace/comms surfaces expose those fact deltas. This check pins the shipped path without rebuilding it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { scenarioRuntime } from '../src/systems/scenarioRuntime.js';
import { formatScenarioIssue, validateScenarioDocument } from '../src/contracts/scenarioSchemas.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCENARIO_PATH = 'src/data/scenarios/47a.scenario.json';
const scenario = readJson(SCENARIO_PATH);
const GAME_STATE_SOURCE = readText('src/core/gameState.js');
const SF_SIM_SOURCE = readText('scripts/sf-sim.mjs');
const EVENT_TRACE_SOURCE = readText('src/core/eventTrace.js');
const COMMS_SOURCE = readText('src/ui/comms.js');

const EXPECTED_FACTS = Object.freeze({
  'fact.47a.evidence_status': 'unresolved',
  'fact.47a.civilian_status': 'unresolved',
  'fact.47a.faction_pressure': 'none',
  'fact.47a.carrier_hazard': 'stable',
  'fact.47a.contract_record': 'open',
});

const EXPECTED_ESCAPE_EFFECTS = Object.freeze({
  'fact.47a.evidence_status': 'escaped_with_player',
  'fact.47a.faction_pressure': 'concord_recovery_warrant',
  'fact.47a.contract_record': 'pending_evidence_unreconciled',
});

assert.equal(typeof window, 'undefined', 'this check must run headless');

withDeterminismGuard(() => {
  testScenarioContractDeclaresFactLedger();
  testRuntimeInitializesFactsAndReceipts();
  testBranchMutatesFactsWithReceipts();
  testSerializeDeserializePreservesFactLedger();
  testFactLedgerSurfacesAreWired();
});

console.log('PASS  check:fact-ledger');

function testScenarioContractDeclaresFactLedger() {
  const report = validateScenarioDocument(scenario, { file: SCENARIO_PATH });
  assert.equal(report.ok, true, report.issues.map(formatScenarioIssue).join('\n'));

  assert.deepEqual(Object.fromEntries(scenario.facts.map((fact) => [fact.id, fact.initial])), EXPECTED_FACTS,
    '47-A declares the pinned initial fact ledger');

  const factIds = new Set(scenario.facts.map((fact) => fact.id));
  assert.equal(factIds.size, scenario.facts.length, 'world fact ids are unique');
  for (const fact of scenario.facts) {
    assert.equal(fact.owner, 'scenario.47a', `${fact.id} keeps scenario ownership`);
    assert.equal(typeof fact.description, 'string', `${fact.id} has a readable description`);
    assert.ok(fact.description.length >= 20, `${fact.id} description is not a placeholder`);
  }

  for (const beat of scenario.beats) {
    assert.ok(Array.isArray(beat.worldFactRefs) && beat.worldFactRefs.length > 0,
      `${beat.id} references at least one fact`);
    for (const factId of beat.worldFactRefs) assert.ok(factIds.has(factId), `${beat.id} references declared ${factId}`);
  }

  const escape = branchById('escape_with_evidence');
  assert.deepEqual(Object.fromEntries(escape.worldFactEffects.map((effect) => [effect.factId, effect.value])),
    EXPECTED_ESCAPE_EFFECTS,
    'escape branch keeps pinned immediate fact outcomes');
  for (const branch of scenario.branches) {
    assert.ok(Array.isArray(branch.worldFactEffects) && branch.worldFactEffects.length > 0,
      `${branch.id} changes immediate facts`);
    for (const effect of branch.worldFactEffects) {
      assert.ok(factIds.has(effect.factId), `${branch.id} changes declared ${effect.factId}`);
      assert.equal(effect.op, 'set', `${branch.id}/${effect.factId} is an immediate set effect`);
    }
  }
}

function testRuntimeInitializesFactsAndReceipts() {
  const h = bootScenarioRuntime();
  assert.deepEqual(factValues(h.state), EXPECTED_FACTS, 'scenarioRuntime initializes declared fact values');
  for (const [id, initial] of Object.entries(EXPECTED_FACTS)) {
    assert.equal(h.state.scenario.facts[id].initial, initial, `${id} preserves initial value`);
    assert.equal(h.state.scenario.facts[id].owner, 'scenario.47a', `${id} preserves owner`);
  }

  assert.equal(h.events.filter((e) => e.event === 'scenario:loaded').length, 1,
    'runtime emits one scenario:loaded receipt');
  const init = h.events.find((e) => e.event === 'scenario:factsInitialized');
  assert.ok(init, 'runtime emits scenario:factsInitialized');
  assert.equal(init.payload.factCount, Object.keys(EXPECTED_FACTS).length,
    'factsInitialized names the real fact count');
  assert.deepEqual(init.payload.factIds, Object.keys(EXPECTED_FACTS),
    'factsInitialized carries fact ids in contract order');
}

function testBranchMutatesFactsWithReceipts() {
  const h = bootScenarioRuntime();
  unlockResolutionBeat(h.state);

  const result = h.helpers.applyScenarioBranch('escape_with_evidence', { source: 'check-fact-ledger' });
  assert.equal(result.ok, true, 'branch application succeeds through scenarioRuntime helper');
  assert.deepEqual(Object.fromEntries(result.effects.map((effect) => [effect.factId, effect.after])),
    EXPECTED_ESCAPE_EFFECTS,
    'helper result carries every fact delta');

  const values = factValues(h.state);
  for (const [factId, value] of Object.entries(EXPECTED_ESCAPE_EFFECTS)) {
    assert.equal(values[factId], value, `${factId} changed in the live ledger`);
  }
  assert.equal(values['fact.47a.civilian_status'], EXPECTED_FACTS['fact.47a.civilian_status'],
    'unaffected facts remain at their initial value');
  assert.equal(values['fact.47a.carrier_hazard'], EXPECTED_FACTS['fact.47a.carrier_hazard'],
    'unaffected hazard fact remains stable');

  const changed = h.events.filter((e) => e.event === 'scenario:factChanged');
  assert.equal(changed.length, Object.keys(EXPECTED_ESCAPE_EFFECTS).length,
    'runtime emits one factChanged receipt per branch effect');
  for (const event of changed) {
    assert.equal(event.payload.branchId, 'escape_with_evidence');
    assert.equal(event.payload.source, 'check-fact-ledger');
    assert.equal(event.payload.before, EXPECTED_FACTS[event.payload.factId],
      `${event.payload.factId} receipt carries before value`);
    assert.equal(event.payload.after, EXPECTED_ESCAPE_EFFECTS[event.payload.factId],
      `${event.payload.factId} receipt carries after value`);
  }

  const resolved = h.events.find((e) => e.event === 'scenario:branchResolved');
  assert.ok(resolved, 'runtime emits scenario:branchResolved');
  assert.equal(resolved.payload.branchId, 'escape_with_evidence');
  assert.deepEqual(Object.fromEntries(resolved.payload.effects.map((effect) => [effect.factId, effect.after])),
    EXPECTED_ESCAPE_EFFECTS,
    'branchResolved receipt surfaces the same fact deltas');
  assert.equal(resolved.payload.lifecycle.aftermath.includes('Concord issues a recovery warrant'), true,
    'branchResolved carries authored aftermath text for UI surfaces');
}

function testSerializeDeserializePreservesFactLedger() {
  const h = bootScenarioRuntime();
  unlockResolutionBeat(h.state);
  h.helpers.applyScenarioBranch('escape_with_evidence', { source: 'check-fact-ledger' });

  const sys = h.sim.registry.get('scenarioRuntime');
  const snap = sys.serialize();
  snap.facts['fact.47a.evidence_status'].value = 'mutated_snapshot_only';
  assert.equal(h.state.scenario.facts['fact.47a.evidence_status'].value, EXPECTED_ESCAPE_EFFECTS['fact.47a.evidence_status'],
    'serialize returns a clone, not a live fact object');

  const restored = sys.serialize();
  h.state.scenario = null;
  sys.deserialize(restored);
  assert.equal(h.state.scenario.facts['fact.47a.evidence_status'].value,
    EXPECTED_ESCAPE_EFFECTS['fact.47a.evidence_status'],
    'deserialize restores changed fact values');
  assert.equal(h.state.scenario.resolution.branchId, 'escape_with_evidence',
    'deserialize preserves the branch resolution attached to the fact ledger');
}

function testFactLedgerSurfacesAreWired() {
  const checks = [
    [GAME_STATE_SOURCE, /scenario:\s*\{[\s\S]*active:\s*null,[\s\S]*facts:\s*\{\}/,
      'gameState owns the shipped fact ledger under state.scenario.facts'],
    [SF_SIM_SOURCE, /for \(const \[id, fact\] of Object\.entries\(scenario\.facts \|\| \{\}\)\.sort\(\(\[a\], \[b\]\) => a\.localeCompare\(b\)\)\)/,
      'sf-sim trace reads scenario facts into scenarioContract.factValues'],
    [EVENT_TRACE_SOURCE, /'scenario:factsInitialized'[\s\S]*'scenario:factChanged'[\s\S]*'scenario:branchResolved'/,
      'event trace includes fact initialization, fact deltas, and branch resolution'],
    [COMMS_SOURCE, /bus\.on\('scenario:branchResolved'[\s\S]*branchLifecycleCommsPayload\(payload \|\| \{\}\)/,
      'comms surfaces branch lifecycle text from fact-changing branch resolution'],
  ];
  for (const [source, pattern, label] of checks) {
    if (!pattern.test(source)) throw new Error(`fact-ledger surface contract failed: ${label}`);
  }
}

function bootScenarioRuntime() {
  const events = [];
  const helpers = {
    scenarioContract: scenario,
    scenarioContractPath: SCENARIO_PATH,
    scenarioContractHash: 'check-fact-ledger',
  };
  const sim = createSimulation({ seed: 47, systems: [scenarioRuntime], helpers });
  for (const event of ['scenario:loaded', 'scenario:factsInitialized', 'scenario:factChanged', 'scenario:branchResolved']) {
    sim.bus.on(event, (payload) => events.push({ event, payload }));
  }

  const player = {
    id: 1,
    alive: true,
    type: 'ship',
    pos: { x: 0, y: 0, z: 0 },
    prevPos: copyablePos(),
    rot: 0,
    bank: 0,
    pitch: 0,
    ttl: Infinity,
    data: { scenarioActorId: 'player_kestrel', defId: 'ship_kestrel' },
  };
  sim.state.mode = 'flight';
  sim.state.playerId = player.id;
  sim.state.entities.set(player.id, player);
  sim.state.entityList.push(player);
  sim.runTicks(1);

  assert.ok(sim.state.scenario.active, 'scenarioRuntime activated the scenario');
  return { sim, state: sim.state, bus: sim.bus, helpers, events };
}

function unlockResolutionBeat(state) {
  state.scenario.active.activeBeatId = 'resolution_branch';
  if (!state.scenario.enteredBeatIds.includes('resolution_branch')) {
    state.scenario.enteredBeatIds.push('resolution_branch');
  }
}

function branchById(id) {
  const branch = scenario.branches.find((item) => item.id === id);
  assert.ok(branch, `scenario branch exists: ${id}`);
  return branch;
}

function copyablePos() {
  return {
    x: 0,
    y: 0,
    z: 0,
    copy(other) {
      this.x = Number(other && other.x) || 0;
      this.y = Number(other && other.y) || 0;
      this.z = Number(other && other.z) || 0;
      return this;
    },
  };
}

function factValues(state) {
  return Object.fromEntries(Object.entries(state.scenario.facts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, fact]) => [id, fact.value]));
}

function readJson(rel) {
  return JSON.parse(readText(rel));
}

function readText(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

function withDeterminismGuard(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random is forbidden in check:fact-ledger'); };
  Date.now = () => { throw new Error('Date.now is forbidden in check:fact-ledger'); };
  try {
    fn();
  } finally {
    Math.random = random;
    Date.now = now;
  }
}
