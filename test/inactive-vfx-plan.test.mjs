import assert from 'node:assert/strict';
import test from 'node:test';

import { INACTIVE_TUMBLE_VFX_PLAN, tumbleVfxLooksActive } from '../src/render/inactiveVfxPlan.js';

test('inactive plan is frozen and only tumbling or thrown trails look active', () => {
  assert.equal(Object.isFrozen(INACTIVE_TUMBLE_VFX_PLAN), true);
  assert.equal(tumbleVfxLooksActive(null, null), false);
  assert.equal(tumbleVfxLooksActive({ mode: 'idle' }, null), false);
  assert.equal(tumbleVfxLooksActive({ mode: 'tumbling' }, null), true);
  assert.equal(tumbleVfxLooksActive({ mode: 'idle', recovering: true }, null), true);
  assert.equal(tumbleVfxLooksActive({ mode: 'idle' }, { active: true }), true);
});
