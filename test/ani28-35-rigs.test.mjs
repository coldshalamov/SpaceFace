// Group B banks: ANI-28 ore-barge claw gantry, ANI-29 freight-platform crane,
// ANI-30 inspection-cutter arm. ANI-37 adds the customs patrol hull (hornet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { evaluateMotionClip, validateMotionBank } from '../src/contracts/motionBank.js';

const bank = (key) => JSON.parse(
  readFileSync(new URL(`../assets/ships/motions/${key}.motion.json`, import.meta.url)));

const allBankKeys = readdirSync(new URL('../assets/ships/motions', import.meta.url))
  .filter((f) => f.endsWith('.motion.json'))
  .map((f) => f.replace(/\.motion\.json$/, ''));

const clip = (b, name) => {
  const c = b.clips.find((x) => x.name === name);
  assert.ok(c, `clip ${name} missing`);
  return c;
};
const delta = (b, name, t, group) => evaluateMotionClip(b, clip(b, name), t).get(group) || {};
const REST = { rotation: [0, 0, 0, 1] };
const nearRestRot = (q) => REST.rotation.every((v, i) => Math.abs(q[i] - v) < 1e-3);

for (const key of ['ore-barge', 'freight-platform', 'inspection-cutter', 'hornet-production-v1']) {
  test(`${key} bank schema + bindings + rest poses`, () => {
    const b = bank(key);
    assert.equal(b.schema, 'spaceface.rigidMotionBank.v1');
    assert.ok(b.bindings.length > 0);
    for (const bd of b.bindings) {
      assert.match(bd.node, /^MOTION_/);
      assert.ok(bd.restPose && bd.restPose.translation && bd.restPose.rotation);
      assert.ok(bd.restPose.scale.every((s) => s > 0));
    }
  });
}

test('ANI-28 claw_cycle drops, bites, traverses and returns home', () => {
  const b = bank('ore-barge');
  assert.equal(clip(b, 'claw_cycle').endMode, 'rest');
  const dropped = delta(b, 'claw_cycle', 1.2, 'barge_claw').translation;
  assert.ok(dropped[1] < -0.9, `claw dropped to the barge load (y=${dropped[1]})`);
  const openMid = delta(b, 'claw_cycle', 0.85, 'barge_claw_l').rotation;
  assert.ok(!nearRestRot(openMid), 'jaws open during grab');
  const traversed = delta(b, 'claw_cycle', 3.4, 'barge_trolley').translation;
  assert.ok(Math.abs(traversed[2]) > 1.0, `trolley slid down the rail (z=${traversed[2]})`);
  for (const g of ['barge_trolley', 'barge_claw']) {
    const end = delta(b, 'claw_cycle', 4.8, g).translation;
    assert.ok(end.every((v) => Math.abs(v) < 1e-3), `${g} ends at rest`);
  }
});

test('ANI-29 gantry_pick lowers the hook and sweeps a lane', () => {
  const b = bank('freight-platform');
  const dropped = delta(b, 'gantry_pick', 2.2, 'freight_hook').translation;
  assert.ok(dropped[1] < -1.5, `hook dropped to a crate (y=${dropped[1]})`);
  const rolled = delta(b, 'gantry_pick', 1.4, 'freight_bridge').translation;
  assert.ok(rolled[0] > 4.0, `bridge rolled to the cell (x=${rolled[0]})`);
  const swept = delta(b, 'gantry_sweep', 0.9, 'freight_carriage').translation;
  assert.ok(Math.abs(swept[2]) > 0.4, `carriage traversed lanes (z=${swept[2]})`);
});

test('ANI-30 arm_extend reaches out and holds through the inspection', () => {
  const b = bank('inspection-cutter');
  const reached = delta(b, 'arm_extend', 1.5, 'cutter_arm').translation;
  assert.ok(Math.abs(reached[2]) > 0.8, `arm extended on its mount (z=${reached[2]})`);
  assert.equal(clip(b, 'arm_extend').endMode, 'hold');
  assert.ok(b.events['lawfulInspection:choose'] === 'arm_extend'
    || b.events['customs:submit'] === 'arm_extend');
});

test('ANI-37 hornet brace pitches canards, spread pods; sweep ripples flaps', () => {
  const b = bank('hornet-production-v1');
  // brace: canards bite up about their root pivots, tip pods yaw out
  assert.ok(Math.abs(delta(b, 'hornet_brace', 0.3, 'hornet_canard_p').rotation[3] - 1) > 1e-3
    || delta(b, 'hornet_brace', 0.3, 'hornet_canard_p').rotation
      .slice(0, 3).some((v) => Math.abs(v) > 1e-3),
    'canards pitch up during the brace');
  const podP = delta(b, 'hornet_brace', 0.45, 'hornet_tippod_p').rotation;
  const podS = delta(b, 'hornet_brace', 0.45, 'hornet_tippod_s').rotation;
  assert.ok(podP[1] * podS[1] < 0, `pods yaw mirrored (p=${podP[1]}, s=${podS[1]})`);
  // sweep: port flap row leads, starboard follows
  assert.ok(delta(b, 'hornet_sweep', 0.3, 'hornet_flap_p').rotation
    .slice(0, 3).some((v) => Math.abs(v) > 1e-3), 'port flaps lead the sweep');
  // lunge: tip pods punch forward on their rail
  const punch = delta(b, 'hornet_lunge', 0.2, 'hornet_tippod_p').translation;
  assert.ok(punch[0] > 0.2, `tip barrel punched out (x=${punch[0]})`);
  // yield returns to rest by clip end
  for (const g of ['hornet_canard_p', 'hornet_tippod_p']) {
    assert.ok(nearRestRot(delta(b, 'hornet_yield', 1.2, g).rotation),
      `${g} stands down to rest`);
  }
  assert.equal(b.events['lawfulInspection:choose'], 'hornet_brace');
  assert.equal(b.events['customs:breakScan'], 'hornet_yield');
});

test('every committed motion bank passes validateMotionBank', () => {
  assert.ok(allBankKeys.length >= 20, 'expected the full bank set');
  for (const key of allBankKeys) {
    assert.doesNotThrow(() => validateMotionBank(bank(key)),
      `${key}.motion.json fails contract validation`);
  }
});
