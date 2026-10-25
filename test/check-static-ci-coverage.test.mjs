import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const workflowPath = process.env.WORKFLOW_FILE
  || fileURLToPath(new URL('../.github/workflows/check.yml', import.meta.url));
const workflow = readFileSync(workflowPath, 'utf8');
const staticJob = workflow.match(/^  static:\n([\s\S]*?)(?=^  sim:)/m)?.[1];
assert.ok(staticJob, 'static job exists');
const steps = [...staticJob.matchAll(/^      - name: (.+)\n([\s\S]*?)(?=^      - name:|(?![\s\S]))/gm)];
const step = (name) => steps.find((entry) => entry[1].startsWith(name))?.[2];
const install = step('Install dependencies');
const matrix = step('Run static check group');
const condition = matrix?.match(/^        if: \$\{\{ (.+) \}\}$/m)?.[1];

// Model GitHub's documented status semantics, not a runner integration test:
// an omitted status function adds success(); cancelled() suppresses that default.
// Evaluate only this deliberately narrow expression grammar, never arbitrary workflow code.
function shouldRun({ cancelled = false, installOutcome = 'success', earlierFailure = false } = {}) {
  if (!condition) return !cancelled && !earlierFailure;
  assert.equal(condition, "!cancelled() && steps.install-dependencies.outcome == 'success'");
  return !cancelled && installOutcome === 'success';
}

test('matrix explicitly requires successful dependency installation and no cancellation', () => {
  assert.match(install, /^        id: install-dependencies$/m);
  assert.equal(condition, "!cancelled() && steps.install-dependencies.outcome == 'success'");
});

test('normal successful setup executes the matrix on every static shard', () => {
  for (const shard of [1, 2, 3]) assert.equal(shouldRun(), true, `shard ${shard}`);
});

test('ordinary test failures do not suppress independent matrix coverage', () => {
  for (const failure of ['visual continuity', 'Orchard', 'Ceres', 'program control']) {
    assert.equal(shouldRun({ earlierFailure: true }), true, failure);
  }
});

test('failed, skipped, cancelled, or unavailable dependency installation fails closed', () => {
  for (const installOutcome of ['failure', 'skipped', 'cancelled', '', undefined]) {
    // Undefined is represented as the missing-context empty string in Actions.
    assert.equal(shouldRun({ installOutcome: installOutcome ?? '', earlierFailure: true }), false);
  }
});

test('checkout and Node failures prevent installation and therefore prevent matrix execution', () => {
  for (const prerequisite of ['Checkout', 'Setup Node.js', 'Install dependencies']) {
    assert.doesNotMatch(step(prerequisite), /^        (?:if|continue-on-error):/m);
  }
  assert.equal(shouldRun({ installOutcome: 'skipped', earlierFailure: true }), false);
});

test('cancellation prevents the matrix even after successful setup', () => {
  for (const earlierFailure of [false, true]) {
    assert.equal(shouldRun({ cancelled: true, earlierFailure }), false);
  }
});

test('test failures are not forgiven and final status still requires every group', () => {
  assert.doesNotMatch(staticJob, /continue-on-error:/);
  assert.match(workflow, /needs: \[static, sim, feel, browser\]/);
  assert.match(workflow, /if \[ "\$result" != "success" \]; then failed=1; fi/);
  assert.match(workflow, /if \[ "\$failed" -ne 0 \]; then[\s\S]*?exit 1/);
});
