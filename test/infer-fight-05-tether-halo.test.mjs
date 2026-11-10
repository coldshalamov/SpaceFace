// FIGHT-05 — the threat halo names the tether cutter only during the live cut window.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import { nameThreatFromVisibleRead } from '../src/ai/specialistPlans.js';
import { stepTetherCutHalo, tetherCutHaloLabel } from '../src/ui/threatHalo.js';

const SEED = 4242;
const OPEN = Object.freeze({
  doctrineId: 'tether_control_raider',
  cutWindow: true,
  silhouette: 'corsair_blade',
  telegraphKind: 'attach_spool',
  verb: 'cut_line',
});

test('FIGHT-05 tether cut halo names the window and clears it, seed 4242', () => {
  const state = { seed: SEED, simTime: 4, rng: mulberry32(SEED) };
  assert.equal(state.seed, 4242);
  assert.equal(state.rng(), mulberry32(SEED)());

  const named = nameThreatFromVisibleRead(OPEN);
  assert.equal(named, 'corsair blade spools a Massline and cuts your taut line');
  assert.equal(tetherCutHaloLabel(OPEN), named);

  const slot = {};
  assert.equal(stepTetherCutHalo(slot, OPEN), named);
  assert.equal(slot._tetherCutLabel, named);
  assert.equal(slot._tetherCutLatch, true);

  const closed = { ...OPEN, cutWindow: false };
  assert.equal(tetherCutHaloLabel(closed), null);
  assert.equal(stepTetherCutHalo(slot, closed), null);
  assert.equal(slot._tetherCutLabel, null);
  assert.equal(slot._tetherCutLatch, false);

  const fresh = {};
  assert.equal(stepTetherCutHalo(fresh, closed), null);
  assert.equal(fresh._tetherCutLabel, undefined);

  const otherDoctrine = { ...OPEN, doctrineId: 'ranged_disengager' };
  assert.equal(tetherCutHaloLabel(otherDoctrine), null);
  assert.equal(stepTetherCutHalo({}, otherDoctrine), null);

  assert.equal(tetherCutHaloLabel({ ...OPEN, silhouette: 'sniper_lance' }), null);
  assert.equal(nameThreatFromVisibleRead({ silhouette: 'corsair_blade' }), null);
});
