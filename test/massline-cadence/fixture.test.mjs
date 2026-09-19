import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture, stepFixture, cutFixture, measureFixture } from '../../scripts/lib/masslineCadenceFixture.mjs';
for (const variant of ['baseline', 'cadence']) {
  test(`${variant}: reduced fixture conserves linear/angular momentum without external thrust`, () => {
    const s=createFixture(4242,variant), before=measureFixture(s);
    for(let i=0;i<240;i++)stepFixture(s,{reel:i<120?-1:0});
    const after=measureFixture(s);
    assert.ok(Math.abs(after.momentumX-before.momentumX)<1e-7);
    assert.ok(Math.abs(after.momentumZ-before.momentumZ)<1e-7);
    assert.ok(Math.abs(after.angularMomentum/before.angularMomentum-1)<1e-10);
  });
  test(`${variant}: same seed and tape reproduce bit-for-bit`, () => {
    const a=createFixture(8008,variant), b=createFixture(8008,variant);
    for(let i=0;i<600;i++){const cmd={reel:i%120<30?-1:0,turn:i%70<20?.5:0};stepFixture(a,cmd);stepFixture(b,cmd);}
    assert.deepEqual(measureFixture(a),measureFixture(b));
    assert.ok(Object.values(measureFixture(a)).every(Number.isFinite));
  });
}
test('reduced fixture cut preserves velocity and has no repeat reward', () => {
  const s=createFixture(), v=structuredClone([s.owner.vel,s.payload.vel]);
  assert.equal(cutFixture(s),true);assert.equal(cutFixture(s),false);
  assert.deepEqual([s.owner.vel,s.payload.vel],v);
});
