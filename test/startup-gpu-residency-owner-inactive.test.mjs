// Runtime-witness oct18-final-tether-v2: every expected residency-owner supersede
// surfaced as `[render] background pipeline admission failed` because
// assertResidencyOwnerActive threw the designed cancellation as a plain Error
// instead of the codebase's AbortError class (inactiveOwnerError /
// ownerInactiveTouchError). These fixtures pin the guard's contract:
//
//   1. An inactive owner still throws (the lease guard is unchanged).
//   2. The throw is AbortError-class so observePipelineAdmission skips it and
//      appearance failure records mark cancelled — expected supersede, not a
//      failed admission.
//   3. A real GPU/admission failure keeps name 'Error' and still reaches the
//      observer's warning channel — the fix must not blanket-silence rejects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';

import { observePipelineAdmission } from '../src/render/pipelineReadiness.js';

const require = createRequire(import.meta.url);
const { parse } = require(require.resolve('@babel/parser', { paths: [process.env.SPACEFACE_DEPS_ROOT || process.cwd()] }));
const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module' });

let guardNode;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id?.name === 'assertResidencyOwnerActive') {
    guardNode = node.init;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object' && value.type) walk(value);
  }
}
walk(ast);
assert.ok(guardNode, 'assertResidencyOwnerActive must remain in renderer.js');

const guardCode = source.slice(guardNode.start, guardNode.end);
const assertResidencyOwnerActive = new Function(`return (${guardCode});`)();

function inactiveError() {
  try {
    assertResidencyOwnerActive({ name: 'subject' }, { isActive: () => false });
  } catch (error) {
    return error;
  }
  return null;
}

test('inactive residency owner still throws — the lease guard is preserved', () => {
  const error = inactiveError();
  assert.ok(error, 'the guard must still reject an inactive owner');
  assert.match(error.message, /Authored GPU residency owner became inactive/);
});

test('the cancellation is AbortError-class so observers classify supersede, not failure', () => {
  const error = inactiveError();
  assert.equal(error.name, 'AbortError',
    'expected owner supersede must carry the codebase cancellation class');
  assert.match(error.message, /owner became inactive/,
    'the message must stay in the /owner became inactive/ readmission class');
});

test('an active or unguarded owner is never rejected', () => {
  assert.doesNotThrow(() => assertResidencyOwnerActive({ name: 's' }, { isActive: () => true }));
  assert.doesNotThrow(() => assertResidencyOwnerActive({ name: 's' }, { isActive: 'yes' }));
  assert.doesNotThrow(() => assertResidencyOwnerActive({ name: 's' }, {}));
});

test('observer channel: cancelled owner is skipped, real GPU failure still warns', async () => {
  const warnings = [];
  const onRejected = (error) => warnings.push(error);

  observePipelineAdmission(Promise.reject(inactiveError()), onRejected);
  await nextTurn();
  assert.deepEqual(warnings, [], 'expected supersede must not page the failure channel');

  const gpuFailure = new Error('texture upload driver failure');
  observePipelineAdmission(Promise.reject(gpuFailure), onRejected);
  await nextTurn();
  assert.deepEqual(warnings, [gpuFailure],
    'invalid active-owner GPU failures keep their Error class and warning');
});
