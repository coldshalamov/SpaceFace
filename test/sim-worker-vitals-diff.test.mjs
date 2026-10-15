import test from 'node:test';
import assert from 'node:assert/strict';

import { collectEntityVitals, entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';

function legacyCollect(state, shadow) {
  const out = [];
  const seen = new Set();
  for (const e of state.entityList || []) {
    if (!e || !Number.isSafeInteger(e.id)) continue;
    seen.add(e.id);
    const fields = entityVitalsOf(e);
    const sig = JSON.stringify(fields);
    if (shadow.get(e.id) !== sig) {
      shadow.set(e.id, sig);
      out.push([e.id, fields]);
    }
  }
  for (const id of shadow.keys()) {
    if (!seen.has(id)) shadow.delete(id);
  }
  return out;
}

function compareStep(state, optimizedShadow, optimizedSeen, referenceShadow) {
  assert.deepStrictEqual(
    collectEntityVitals(state, optimizedShadow, optimizedSeen),
    legacyCollect(state, referenceShadow),
  );
}

test('vitals shadow preserves the legacy changed-row wire and avoids steady rows', () => {
  const ship = {
    id: 7,
    hull: 100,
    hullMax: 120,
    rot: 0,
    alive: true,
    vel: { x: 0, z: -0 },
    boost: { energy: 3, max: 5 },
  };
  const state = { entityList: [ship] };
  const optimizedShadow = new Map();
  const optimizedSeen = new Set();
  const referenceShadow = new Map();

  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);

  ship.hull = 96;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);

  // JSON signatures intentionally treat all of these as the same null token.
  ship.hull = Number.NaN;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  ship.hull = Number.POSITIVE_INFINITY;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  ship.hull = null;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);

  delete ship.vel;
  delete ship.boost.energy;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  ship.vel = { x: 4, z: 5 };
  ship.boost.energy = 2;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
});

test('vitals shadow removes departed ids and emits a recycled id again', () => {
  const state = { entityList: [{ id: 12, hull: 10 }] };
  const optimizedShadow = new Map();
  const optimizedSeen = new Set();
  const referenceShadow = new Map();

  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  state.entityList.length = 0;
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
  assert.equal(optimizedShadow.has(12), false);
  state.entityList.push({ id: 12, hull: 20 });
  compareStep(state, optimizedShadow, optimizedSeen, referenceShadow);
});
