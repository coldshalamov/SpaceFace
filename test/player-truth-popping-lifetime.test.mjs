import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPopping, CLS, VIS } from '../scripts/player-truth/checks.mjs';

const lifeEntity = (id, { vis = VIS.onscreen, sx = 640, sy = 360 } = {}) =>
  [id, CLS.asteroid, 0, 0, 0, 0, sx, sy, 10, vis, -1, 0];

function removalTrace({ id = 1_000_042, goneAt = 20, events = [], sampleCount = 60, entity = lifeEntity } = {}) {
  return {
    meta: { mode: 'adventure', rounds: false }, keys: [], events,
    samples: Array.from({ length: sampleCount }, (_, i) => ({
      f: i, t: i * 100, sim: 10 + i * 0.1, mode: 'flight', vw: 1280, vh: 720,
      e: i < goneAt ? [entity(id, i)] : [],
    })),
  };
}

test('popping accepts a delayed exact-life death receipt, but rejects a future receipt', () => {
  const id = 1_000_042;
  const delayed = removalTrace({ id, events: [{ ev: 'asteroid-destroyed', id, sim: 11.5 }] });
  assert.equal(checkPopping(delayed).status, 'PASS', 'a receipt before the removal sample excuses the old presentation row');

  const future = removalTrace({ id, events: [{ ev: 'asteroid-destroyed', id, sim: 12.1 }] });
  assert.equal(checkPopping(future).status, 'FAIL', 'a receipt after the removal sample cannot hide a pop');
});

test('popping never matches a recycled raw id from another life', () => {
  const id = 1_000_042;
  const priorLife = removalTrace({ id, events: [{ ev: 'asteroid-destroyed', id: 42, sim: 11.5 }] });
  assert.equal(checkPopping(priorLife).status, 'FAIL', 'raw-id reuse must not excuse a current life');
  const otherGeneration = removalTrace({ id, events: [{ ev: 'asteroid-destroyed', id: 2_000_042, sim: 11.5 }] });
  assert.equal(checkPopping(otherGeneration).status, 'FAIL', 'a different reader life id must remain unmatched');
  assert.equal(checkPopping(removalTrace({ id })).status, 'FAIL', 'an unreceipted removal remains a failure');
});

test('popping ignores an offscreen-to-onscreen camera crossing but grades an active inner-view toggle', () => {
  const id = 77;
  const crossing = removalTrace({ id, goneAt: 60, entity: (entityId, i) => i === 0
    ? lifeEntity(entityId, { vis: VIS.hidden, sx: -326 })
    : lifeEntity(entityId) });
  assert.equal(checkPopping(crossing).status, 'PASS', 'the previous rendered position was outside the inner view');

  const activeToggle = removalTrace({ id, goneAt: 60, entity: (entityId, i) =>
    lifeEntity(entityId, { vis: i % 2 ? VIS.onscreen : VIS.hidden }) });
  assert.equal(checkPopping(activeToggle).status, 'FAIL', 'an on-screen live toggle remains a popping failure');
});
