import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { validateShipAsset } from '../src/contracts/assetValidation.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const KESTREL = 'assets/ships/kestrel/kestrel_reference.glb';

const defaultValidation = validateShipAsset(KESTREL, { root: ROOT });
assert.equal(defaultValidation.ok, true, 'valid authored geometry passes without a universal triangle or byte ceiling');
assert.equal(defaultValidation.issueCount, 0, 'historical profiles do not create hard issues');
assert.deepEqual(defaultValidation.diagnostics, [], 'the current Kestrel remains within its historical diagnostic profile');
assert(defaultValidation.checks.some((check) => check.rule === 'geometry.nonempty' && check.ok),
  'nonempty triangle geometry remains a hard validation check');
assert(!defaultValidation.checks.some((check) => check.rule === 'budget.triangles'),
  'default validation does not invent a universal triangle budget');
assert(!defaultValidation.checks.some((check) => check.rule === 'budget.bytes'),
  'default validation does not invent a universal byte budget');

const reviewedTriangleLimit = validateShipAsset(KESTREL, { root: ROOT, maxTriangles: 1 });
assert.equal(reviewedTriangleLimit.ok, false, 'an explicit per-asset triangle limit remains enforceable');
assert(reviewedTriangleLimit.issues.some((issue) => issue.rule === 'budget.triangles'),
  'explicit triangle-limit failure is machine-readable');

const reviewedByteLimit = validateShipAsset(KESTREL, { root: ROOT, maxBytes: 1 });
assert.equal(reviewedByteLimit.ok, false, 'an explicit per-asset byte limit remains enforceable');
assert(reviewedByteLimit.issues.some((issue) => issue.rule === 'budget.bytes'),
  'explicit byte-limit failure is machine-readable');

const invalidReviewedLimit = validateShipAsset(KESTREL, { root: ROOT, maxTriangles: 0 });
assert.equal(invalidReviewedLimit.ok, false, 'an invalid explicit per-asset limit cannot silently disable enforcement');
assert(invalidReviewedLimit.issues.some((issue) => issue.rule === 'budget.triangles'),
  'invalid explicit limit is machine-readable');

console.log('PASS asset validation technique policy: integrity hard, historical profiles diagnostic, reviewed limits enforceable');
