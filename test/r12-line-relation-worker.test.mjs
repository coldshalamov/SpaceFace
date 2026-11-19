// R12 (design/overhaul/03_COMBAT.md §2.1): the worker lane must publish rope posture and body mass through the
// per-tick vitals diff with explicit clears, so a body that turns dynamic again stops reading ANCHOR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEntityVitals, entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { applyEntityVitals } from '../scripts/lib/simReadModel.mjs';
import { lineRelationWord, lineBodyFixed, lineBodyMassT } from '../src/ui/lineRelation.js';

function body(id, physicsBody, mass = 10) {
  return { id, type: 'pod', alive: true, mass, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 2, physicsBody };
}

test('vitals publish fixedBody and bodyMassT with explicit clear values', () => {
  const pod = body(7, { dynamic: false, mass: 10 });
  assert.equal(entityVitalsOf(pod).fixedBody, true);
  assert.equal(entityVitalsOf(pod).bodyMassT, 0, 'body mass equal to nominal mass needs no override');
  pod.physicsBody = { dynamic: true, mass: 60 };
  const v = entityVitalsOf(pod);
  assert.equal(v.fixedBody, false, 'explicit clear, not an omitted key');
  assert.equal(v.bodyMassT, 60);
  assert.equal(entityVitalsOf(body(8, undefined)).fixedBody, false);
});

test('a posture or body-mass change alone re-emits the entity through the vitals diff', () => {
  const pod = body(7, { dynamic: false, mass: 10 });
  const state = { entityList: [pod], world: {} };
  const shadow = new Map();
  assert.equal(collectEntityVitals(state, shadow).length, 1, 'first publish');
  assert.equal(collectEntityVitals(state, shadow).length, 0, 'steady');
  pod.physicsBody = { dynamic: true, mass: 10 };
  const out = collectEntityVitals(state, shadow);
  assert.equal(out.length, 1, 'release alone is a vitals change');
  assert.equal(out[0][1].fixedBody, false);
  pod.physicsBody = { dynamic: true, mass: 40 };
  assert.equal(collectEntityVitals(state, shadow)[0][1].bodyMassT, 40);
});

test('the main-lane row stops reading ANCHOR after the release update (Orchard pod)', () => {
  const pod = body(7, { dynamic: false, mass: 10 });
  const row = { id: 7, mass: 10, fixedBody: true };
  const readModel = { entities: new Map([[7, row]]) };
  assert.equal(lineRelationWord(row, 18), 'ANCHOR');
  applyEntityVitals(readModel, [[7, entityVitalsOf(pod)]]);
  assert.equal(row.fixedBody, true);
  pod.physicsBody = { dynamic: true, mass: 10 };
  applyEntityVitals(readModel, [[7, entityVitalsOf(pod)]]);
  assert.equal(row.fixedBody, false);
  assert.equal(lineRelationWord(row, 18), 'TOW', '10 t pod against an 18 t hull');
  pod.physicsBody = { dynamic: true, mass: 80 };
  applyEntityVitals(readModel, [[7, entityVitalsOf(pod)]]);
  assert.equal(lineBodyMassT(row), 80);
  pod.physicsBody = { dynamic: true, mass: 10 };
  applyEntityVitals(readModel, [[7, entityVitalsOf(pod)]]);
  assert.equal(lineBodyMassT(row), 10, 'a cleared bodyMassT falls back to the nominal mass');
});

test('a live physicsBody.dynamic flag wins over a stale mirrored fixedBody', () => {
  assert.equal(lineBodyFixed({ fixedBody: true, physicsBody: { dynamic: true } }), false);
  assert.equal(lineBodyFixed({ fixedBody: false, physicsBody: { dynamic: false } }), true);
  assert.equal(lineBodyFixed({ fixedBody: true }), true, 'no live body: the mirror stands');
});
