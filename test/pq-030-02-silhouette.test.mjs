// PQ-030.02 silhouette/behaviour clause. Seed 30000.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SPECIALIST_PLANS,
  nameThreatFromSilhouetteAlone,
  nameThreatFromVisibleRead,
  specialistPlanById,
} from '../src/ai/specialistPlans.js';

const SEED = 30000;

test(`seed ${SEED}: a blind read of silhouette + telegraph + verb names the tether-cutter`, () => {
  const plan = specialistPlanById('tether_cutter');
  const named = nameThreatFromVisibleRead({
    silhouette: plan.silhouette,
    telegraphKind: plan.telegraphKind,
    verb: plan.verb,
  });
  assert.equal(plan.silhouette, 'corsair_blade');
  assert.equal(plan.telegraphKind, 'attach_spool');
  assert.equal(plan.verb, 'cut_line');
  assert.match(named, /cuts your taut line/i);
  for (const other of SPECIALIST_PLANS.filter((row) => row.id !== 'tether_cutter')) {
    assert.equal(
      nameThreatFromVisibleRead({
        silhouette: other.silhouette,
        telegraphKind: other.telegraphKind,
        verb: other.verb,
      }),
      null,
      `${other.id} must not steal the cutter's sentence`,
    );
  }
  console.log(`SEED=${SEED} silhouette=${plan.silhouette} telegraph=${plan.telegraphKind} named="${named}"`);
});

test(`seed ${SEED}: corsair_blade alone names the cutter; shared bruiser_armor does not`, () => {
  const named = nameThreatFromSilhouetteAlone('corsair_blade');
  assert.match(named, /cuts your taut line/i);
  assert.equal(nameThreatFromSilhouetteAlone('bruiser_armor'), null);
  assert.equal(nameThreatFromSilhouetteAlone('sniper_lance'), null);
  assert.equal(nameThreatFromSilhouetteAlone('unknown_hull'), null);
  console.log(`SEED=${SEED} silhouette-alone="${named}" residual=no-headed-still`);
});
