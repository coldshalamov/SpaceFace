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
import { assertCompleteAppearanceAdmission } from '../src/render/renderer.js';

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
const guardState = { render: {} };
const assertResidencyOwnerActive = new Function('state', `return (${guardCode});`)(guardState);

function inactiveError(isActive = () => false) {
  try {
    assertResidencyOwnerActive({ name: 'subject' }, { isActive });
  } catch (error) {
    return error;
  }
  return null;
}

function captureGuardCall(isActive, ownerSnapshot) {
  const warnings = [];
  const infos = [];
  guardState.render = {};
  const previousWarn = console.warn;
  const previousInfo = console.info;
  console.warn = (...args) => warnings.push(args);
  console.info = (...args) => infos.push(args);
  try {
    const error = inactiveError(Object.assign(isActive, { ownerSnapshot: () => ownerSnapshot }));
    return { error, warnings, infos, diagnostic: guardState.render.lastGpuResidencyOwnerInactive };
  } finally {
    console.warn = previousWarn;
    console.info = previousInfo;
  }
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

test('a definitively retired authored boundary is an informational cancellation', () => {
  const result = captureGuardCall(() => false, {
    ownerType: 'authored-boundary',
    entityId: 530,
    entityAlive: false,
    entityIsCurrent: false,
    entityStillRequired: false,
  });
  assert.equal(result.error.name, 'AbortError');
  assert.equal(result.error.code, 'GPU_RESIDENCY_OWNER_INACTIVE');
  assert.deepEqual(result.warnings, [], 'retired work must not appear as a live GPU failure');
  assert.deepEqual(result.infos, [[
    '[render] authored GPU residency cancelled for retired boundary 530',
  ]], 'diagnostic output is primitive and preserves the retired owner identity');
  assert.deepEqual(result.diagnostic, {
    subjectName: 'subject',
    owner: {
      ownerType: 'authored-boundary',
      entityId: 530,
      entityAlive: false,
      entityIsCurrent: false,
      entityStillRequired: false,
    },
  }, 'the existing last-owner diagnostic remains available for inspection');
});

test('a live nonrequired boundary superseded only by context loss is informational', () => {
  const result = captureGuardCall(() => false, {
    ownerType: 'authored-boundary',
    entityId: 774,
    entityAlive: true,
    entityIsCurrent: true,
    entityStillRequired: false,
    boundaryAttached: true,
    renderMatches: true,
    rendererMatches: true,
    admissionGenerationMatches: true,
    contextLossGenerationMatches: false,
    portMatches: true,
  });
  assert.equal(result.error.name, 'AbortError');
  assert.equal(result.error.code, 'GPU_RESIDENCY_OWNER_INACTIVE');
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.infos, [[
    '[render] authored GPU residency cancelled after context loss for boundary 774',
  ]]);
});

test('required, same-generation, mismatched, and unknown authored owners retain warning severity', () => {
  for (const ownerSnapshot of [
    { ownerType: 'authored-boundary', entityAlive: true, entityIsCurrent: true, entityStillRequired: true },
    { ownerType: 'authored-boundary', entityAlive: false, entityIsCurrent: false, entityStillRequired: true },
    { ownerType: 'authored-boundary', entityAlive: false, entityIsCurrent: true, entityStillRequired: false },
    {
      ownerType: 'authored-boundary', entityAlive: true, entityIsCurrent: true, entityStillRequired: false,
      boundaryAttached: true, renderMatches: true, rendererMatches: true,
      admissionGenerationMatches: true, contextLossGenerationMatches: true, portMatches: true,
    },
    {
      ownerType: 'authored-boundary', entityAlive: true, entityIsCurrent: true, entityStillRequired: false,
      boundaryAttached: true, renderMatches: true, rendererMatches: false,
      admissionGenerationMatches: true, contextLossGenerationMatches: false, portMatches: true,
    },
    {
      ownerType: 'authored-boundary', entityAlive: true, entityIsCurrent: true, entityStillRequired: false,
      boundaryAttached: true, renderMatches: true, rendererMatches: true,
      admissionGenerationMatches: true, contextLossGenerationMatches: false, portMatches: false,
    },
    {
      ownerType: 'authored-boundary', entityAlive: true, entityIsCurrent: true, entityStillRequired: false,
      boundaryAttached: false, renderMatches: true, rendererMatches: true,
      admissionGenerationMatches: true, contextLossGenerationMatches: false, portMatches: true,
    },
    { ownerType: 'authored-boundary' },
  ]) {
    const result = captureGuardCall(() => false, ownerSnapshot);
    assert.equal(result.error.code, 'GPU_RESIDENCY_OWNER_INACTIVE');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0][0], /authored GPU residency owner became inactive/);
    assert.deepEqual(result.infos, []);
  }
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

test('strict appearance checks classify an owner-inactive receipt as cancellation', async () => {
  const warnings = [];
  const completion = Promise.resolve().then(() => assertCompleteAppearanceAdmission({
    skipped: true,
    reason: 'owner-inactive',
  }));
  observePipelineAdmission(completion, (error) => warnings.push(error));
  await assert.rejects(completion, (error) => error.name === 'AbortError'
    && error.code === 'SF_APPEARANCE_OWNER_INACTIVE');
  await nextTurn();
  assert.deepEqual(warnings, [], 'retired background work is not reported as a GPU failure');

  assert.throws(() => assertCompleteAppearanceAdmission({ skipped: true, reason: 'texture upload failed' }),
    (error) => error.name === 'Error' && !error.code,
    'real incomplete admissions keep their failure classification');
});
