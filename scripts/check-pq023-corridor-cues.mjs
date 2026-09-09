// PQ-023 `gold-corridor-required-cues` — dense-scene corridor gate.
//
// Family (f)'s claim cannot be photographed: a suppressed cue does not render, so a frame capture
// shows the absence of a thing that cannot be pointed at. The proof is therefore a DETERMINISTIC
// SUPPRESSION TRACE — which cue id, on which tick, with which reason — asserted here and written to
// .devshots/pq023-cues/ as route evidence.
//
// The scenario is a dense combat exchange: a wall of flavor cues (routine damage + near misses)
// arriving BEFORE the mechanically critical ones in the same tick, which is exactly the ordering
// that dropped critical state at b6b6422d.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CUE_BUDGET_DECLARATION,
  CUE_LANE_BUDGETS,
  CUE_LANE_CRITICAL_RESERVE,
} from '../src/presentation/cueArbitration.js';
import { getPresentationRecipe } from '../src/presentation/cueRecipes.js';
import {
  impairedDutyCycle, worldSiteConditionForStatus, worldSiteConditionText,
} from '../src/presentation/worldSiteDamageStates.js';
import { CRITICAL_SLICE_EVENT_IDS } from '../src/presentation/cueSchema.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '../.devshots/pq023-cues');

// Deliberately more flavor per tick than any lane can hold, so the tick genuinely saturates.
const FLAVOR_PER_TICK = 10;
const DENSE_TICKS = 6;
// The mechanically critical cues a corridor engagement must never lose.
const CRITICAL_CUES = Object.freeze(['shield.collapse', 'subsystem.disabled', 'tether.break']);

function makeBus() {
  const handlers = new Map();
  const records = [];
  return {
    records,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
      return () => {};
    },
    emit(type, payload) {
      records.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
}

const bus = makeBus();
const state = {
  tick: 0,
  simTime: 0,
  playerId: 1,
  entities: new Map([[1, { id: 1, pos: { x: 0, y: 0, z: 0 } }]]),
};
presentationOrchestrator.init({ state, bus });

const trace = [];
for (let t = 0; t < DENSE_TICKS; t += 1) {
  state.tick = 1000 + t;
  state.simTime = state.tick / 60;

  // Flavor first — this is the ordering that used to win on arrival alone.
  for (let i = 0; i < FLAVOR_PER_TICK; i += 1) {
    const cueId = i % 2 === 0 ? 'combat.damage.applied' : 'combat.near_miss';
    const ok = presentationOrchestrator._emitCue(cueId,
      { attackerId: 50 + i, targetId: 80 + i, applied: 4 + i },
      { sourceEvent: 'dense:flavor', sequence: `t${t}-f${i}` });
    trace.push({ tick: state.tick, id: cueId, klass: 'flavor', emitted: ok });
  }

  // Critical state arrives last and must still land.
  for (const cueId of CRITICAL_CUES) {
    const ok = presentationOrchestrator._emitCue(cueId,
      { attackerId: 9, targetId: 1, subsystemId: 'drive', applied: 40 },
      { sourceEvent: 'dense:critical', sequence: `t${t}-c` });
    trace.push({ tick: state.tick, id: cueId, klass: 'critical', emitted: ok });
  }
}

const criticalRows = trace.filter((r) => r.klass === 'critical');
const flavorRows = trace.filter((r) => r.klass === 'flavor');
const criticalDropped = criticalRows.filter((r) => !r.emitted);
const flavorDropped = flavorRows.filter((r) => !r.emitted);

// --- The corridor contract -------------------------------------------------
assert.equal(criticalDropped.length, 0,
  `critical cues must survive a saturated tick; dropped ${criticalDropped.map((r) => `${r.id}@${r.tick}`).join(', ')}`);
assert.ok(flavorDropped.length > 0,
  'the scenario must actually saturate, otherwise it proves nothing about arbitration');

// Degradation must be by PRIORITY, not by luck: everything dropped is flavor.
const suppressed = bus.records.filter((r) => r.type === 'presentation:cueSuppressed').map((r) => r.payload);
for (const row of suppressed) {
  assert.ok(!CRITICAL_CUES.includes(row.id), `a critical cue was suppressed: ${row.id} (${row.reason})`);
}

// Critical identity must be reachable from the shared markers, not this script's own list.
for (const cueId of CRITICAL_CUES) {
  const recipe = getPresentationRecipe(cueId);
  assert.ok(recipe, `${cueId} must have a recipe`);
  const marked = CRITICAL_SLICE_EVENT_IDS.includes(cueId) || (recipe.tags || []).includes('critical');
  assert.ok(marked, `${cueId} must be marked critical by a shared marker, not by this script`);
}

// The declared budget must be the enforced budget.
assert.equal(CUE_BUDGET_DECLARATION.lanes, CUE_LANE_BUDGETS);
assert.equal(CUE_BUDGET_DECLARATION.criticalReserve, CUE_LANE_CRITICAL_RESERVE);
for (const lane of Object.keys(CUE_LANE_BUDGETS)) {
  assert.ok(CUE_LANE_CRITICAL_RESERVE[lane] > 0 && CUE_LANE_CRITICAL_RESERVE[lane] < CUE_LANE_BUDGETS[lane],
    `${lane} reserve must be a proper subset of its cap`);
}

// World Site damage/recovery must be reachable from its owner receipts (family c).
const siteBefore = bus.records.filter((r) => r.type === 'presentation:cue').length;
state.tick = 2000;
state.simTime = state.tick / 60;
bus.emit('worldSite:failureReceipt', {
  siteId: 'world_site_wreck_cathedral', componentId: 'cathedral_hull',
  triggerId: 'cathedral_hull_impact', stageId: 'dark', receipt: { sequence: 1 },
});
state.tick = 2060;
state.simTime = state.tick / 60;
bus.emit('worldSite:operationReceipt', {
  siteId: 'world_site_wreck_cathedral', componentId: 'cathedral_hull',
  operationId: 'stabilize_cathedral_hull', stageId: 'stabilized',
  receipt: { sequence: 2, complete: true },
});
const siteCues = bus.records.filter((r) => r.type === 'presentation:cue').slice(siteBefore).map((r) => r.payload);
assert.deepEqual(siteCues.map((c) => c.id), ['world_site.damage', 'world_site.recovery'],
  'the Cathedral damage/recovery pair must reach the presentation lane');
for (const cue of siteCues) {
  assert.equal(typeof cue.accessibilityText, 'string',
    `${cue.id} must carry a noncolor / no-audio equivalent`);
  assert.ok(cue.accessibilityText.length > 0);
}

// --- Family (c) evidence: the Cathedral condition matrix ---------------------
// Deterministic, numeric, and reproducible. This is deliberately stronger evidence than a still for
// the claim actually being made: a screenshot cannot show that damaged reads dimmer and smaller
// than nominal BY A MEASURED RATIO, nor that the distinction survives greyscale. Pixel stills at the
// normal camera remain an open row (see the leaf receipt).
const CONDITION_SAMPLES = ['stabilized', 'ready', 'sealed', 'failed', 'offline', 'some_future_status'];
const conditionMatrix = CONDITION_SAMPLES.map((status) => {
  const condition = worldSiteConditionForStatus(status);
  return {
    status,
    condition: condition.condition,
    opacityScale: condition.opacityScale,
    scaleMul: condition.scaleMul,
    stutter: condition.stutter,
    shape: condition.shape,
    // Proof the signal is not colour: every field above is a non-hue channel.
    survivesGreyscale: condition.opacityScale !== 1 || condition.scaleMul !== 1 || condition.condition === 'nominal',
    reducedMotionDutyCycle: impairedDutyCycle(0.05, condition.stutter, true),
    fullMotionDutyCycleAtDropout: impairedDutyCycle(0.05, condition.stutter, false),
    accessibilityText: worldSiteConditionText('Cathedral hull', status),
  };
});

const impairedRow = conditionMatrix.find((r) => r.status === 'failed');
const nominalRow = conditionMatrix.find((r) => r.status === 'stabilized');
assert.ok(impairedRow.opacityScale < nominalRow.opacityScale, 'damaged must read dimmer than nominal');
assert.ok(impairedRow.scaleMul < nominalRow.scaleMul, 'damaged must read smaller than nominal');
assert.equal(impairedRow.reducedMotionDutyCycle, 1, 'reduced motion must hold the damaged cue still');
assert.ok(impairedRow.fullMotionDutyCycleAtDropout < 1, 'full motion must actually stutter');
assert.equal(conditionMatrix.at(-1).condition, 'nominal', 'an unknown status must never render as damage');

const summary = {
  schema: 'spaceface.pq023CorridorCueTrace.v1',
  leafId: 'PQ-023.gold-corridor-required-cues',
  scenario: { flavorPerTick: FLAVOR_PER_TICK, denseTicks: DENSE_TICKS, criticalCues: CRITICAL_CUES },
  budget: { lanes: CUE_LANE_BUDGETS, criticalReserve: CUE_LANE_CRITICAL_RESERVE },
  totals: {
    criticalAttempted: criticalRows.length,
    criticalEmitted: criticalRows.length - criticalDropped.length,
    criticalDropped: criticalDropped.length,
    flavorAttempted: flavorRows.length,
    flavorEmitted: flavorRows.length - flavorDropped.length,
    flavorDropped: flavorDropped.length,
  },
  suppressionByReason: suppressed.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] || 0) + 1;
    return acc;
  }, {}),
  cathedralConditionMatrix: conditionMatrix,
  worldSiteCues: siteCues.map((c) => ({
    id: c.id, accessibilityText: c.accessibilityText, reducedMotionMode: c.reducedMotionMode || null,
    critical: (c.tags || []).includes('critical'),
  })),
  trace,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'dense-scene-suppression-trace.json'), `${JSON.stringify(summary, null, 2)}\n`);
presentationOrchestrator.dispose();

process.stdout.write(`pq023-corridor-cues PASS ${JSON.stringify(summary.totals)} `
  + `reasons=${JSON.stringify(summary.suppressionByReason)}\n`);
