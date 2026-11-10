// PIC-21 — one glint on the seam rock when it opens, gone when the seam is worked.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { richSeamGlintRecord } from '../src/render/vfx/worldCueRecipes.js';
import { traffic } from '../src/systems/traffic.js';

const OPEN = {
  fieldId: 'f_ceres_1',
  activityObjectSlotId: 'ceres_rich_seam',
  sectorId: 'sector_ceres_belt',
};

test('seed 4242 field:richSeamOpened yields one glint and field:richSeamWorked ends it', () => {
  const sim = createSimulation({ seed: 4242, systems: [traffic] });
  const rock = sim.spawn({
    type: 'asteroid',
    team: 0,
    pos: { x: 420, z: -180 },
    vel: { x: 0, z: 0 },
    radius: 18,
    hull: 80,
    hullMax: 80,
    data: { fieldId: OPEN.fieldId, activityObjectSlotId: OPEN.activityObjectSlotId },
  });

  sim.bus.emit('field:richSeamOpened', OPEN);
  sim.bus.emit('field:richSeamOpened', OPEN);
  const glint = richSeamGlintRecord(sim.state);
  assert.ok(glint);
  assert.equal(glint.kind, 'glint');
  assert.equal(glint.id, 'rich-seam-glint');
  assert.equal(glint.targetId, rock.id);
  assert.equal(glint.pos.x, rock.pos.x);
  assert.equal(glint.pos.z, rock.pos.z);
  assert.equal(glint.mapMarker, false);
  assert.equal(rock.data.richSeamGlint, glint.id);
  assert.equal(sim.state.presentation.richSeamGlint, glint);
  assert.equal(Array.isArray(sim.state.presentation.richSeamGlint), false);

  sim.bus.emit('field:richSeamWorked', { ...OPEN, asteroidId: rock.id });
  assert.equal(richSeamGlintRecord(sim.state), null);
  assert.equal(rock.data.richSeamGlint, undefined);
  sim.dispose();
});
