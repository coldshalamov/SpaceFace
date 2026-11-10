import assert from 'node:assert/strict';
import test from 'node:test';
import { compositionIds, getComposition } from '../lib/compositions.mjs';
import { runProject } from '../lib/labRun.mjs';

function metricLine(result) {
  const metrics = result && result.run && result.run.metrics;
  return JSON.stringify(metrics, null, 2);
}

test('eight compositions pass the certifying lab with the authored oracles', { timeout: 300000 }, async () => {
  for (const id of compositionIds()) {
    const result = await runProject(getComposition(id));
    assert.equal(result.ok, true, `${id}\n${(result.issues || []).join('\n')}\n${metricLine(result)}\n${JSON.stringify(result.run && result.run.oracle, null, 2)}\n${result.run && result.run.error}`);
    assert.equal(result.certifying, true, id);
    assert.equal(result.run.seed, getComposition(id).seed);
    assert.equal(result.run.rendering.detached, true);
    assert.ok(result.run.inputTape.frames.length >= 1);
    assert.equal(result.run.scenarioDigest.length > 10, true);
  }
});

test('an impossible playerZ oracle fails instead of passing vacuously', { timeout: 120000 }, async () => {
  const project = getComposition('dock.intercept-cargo');
  project.ticks = 60;
  const objective = project.objects.find((object) => object.id === 'final_z');
  objective.value = 50000;
  const trigger = project.objects.find((object) => object.id === 'cross');
  trigger.assertion.value = 50000;
  trigger.assertion.byTick = 59;
  const result = await runProject(project);
  assert.equal(result.ok, false);
  assert.equal(result.run.certifying, true);
  assert.equal(result.run.oracle.failed.length > 0, true);
});

test('a second lab run still returns after the first runtime is disposed', { timeout: 180000 }, async () => {
  const first = await runProject(getComposition('dock.legal-release'));
  const second = await runProject(getComposition('dock.convoy-rescue'));
  assert.equal(first.ok, true, metricLine(first));
  assert.equal(second.ok, true, metricLine(second));
  assert.notEqual(first.run.scenarioDigest, second.run.scenarioDigest);
});
