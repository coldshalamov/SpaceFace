import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveVfxAdmissionMetadata } from '../src/presentation/vfxAdmissionPriority.js';

test('zero-distance VFX cues receive maximum proximity admission', () => {
  const admission = deriveVfxAdmissionMetadata({
    distance: 0,
    importance: 0.5,
    severity: 0.5,
  });

  assert.equal(admission.proximity, 1);
});
