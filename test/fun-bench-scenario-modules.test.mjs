// test/fun-bench-scenario-modules.test.mjs — the two single-writer seams every fun-loop lane relies on:
// (1) verb scenarios are auto-discovered drop-in modules (no shared registration file);
// (2) a run's metrics.bars feeds the FEEL_CONTRACT bar evaluator without editing feelBars.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { VERB_BENCH_SCENARIOS, listVerbScenarios, discoverScenarioModules } from '../scripts/lib/bench/verbBench.mjs';
import { evaluateBars, FEEL_BARS } from '../scripts/lib/bench/feelBars.mjs';

test('listVerbScenarios keeps every inline scenario and only adds well-formed modules', async () => {
  const merged = await listVerbScenarios();
  for (const inline of VERB_BENCH_SCENARIOS) {
    assert.ok(merged.some((s) => s.id === inline.id), `inline scenario ${inline.id} must survive discovery`);
  }
  const discovered = await discoverScenarioModules();
  for (const [id, spec] of discovered) {
    assert.equal(typeof spec.run, 'function', `module ${spec.module} for ${id} must export run(seed)`);
    assert.ok(merged.some((s) => s.id === id && s.run === spec.run), `discovered ${id} must be dispatched by its module`);
  }
  const ids = merged.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'scenario ids are unique after merge');
});

test('metrics.bars from any run feeds the matching FEEL_CONTRACT bar (single-writer seam)', () => {
  const b2 = FEEL_BARS.find((bar) => bar.id === 'B2');
  assert.ok(b2, 'B2 exists');
  const run = {
    bench: 'verbs',
    scenarioId: 'feel.reversal_course',
    seed: 13502,
    metrics: {
      bars: [
        { bar: 'B2', label: 'rest→cruise, starter hull', value: 1.2, unit: 's', met: true },
        { bar: b2.key, label: 'turn radius at cruise', value: 0.9, unit: 'screen depths', met: false, note: 'live camera depth' },
        { bar: 'B99', label: 'ignored — unknown bar', value: 1, unit: '', met: true },
        { bar: 'B2', label: 'non-finite is dropped', value: 'nope', unit: 's', met: true },
      ],
    },
  };
  const { bars } = evaluateBars([run]);
  const out = bars.find((bar) => bar.id === 'B2');
  assert.equal(out.values.length, 2, 'two finite entries land on B2; the unknown bar and the non-finite value do not');
  assert.equal(out.met, false, '"Turn NOW when I twitch": one unmet clause keeps the bar unmet');
  assert.ok(out.fedBy.includes('verbs/feel.reversal_course/s13502'), 'the feeding run is named');
  assert.match(out.notes, /live camera depth/);
  assert.equal(out.coverage, 'partial');
  assert.equal(out.reachable, true);
});
