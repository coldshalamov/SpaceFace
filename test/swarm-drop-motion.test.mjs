import test from 'node:test';
import assert from 'node:assert/strict';
import {createVisualFactory, setFactoryPresentationNow} from '../src/render/visualFactory.js';
import {createPickupMotionTracker} from '../src/render/pickupMotionPresentation.js';

test('Swarm drop draw callback respects reduced motion, pause and per-drop state', () => {
  const makeEntity = (id) => ({id,type:'pickup',radius:3,pos:{x:600,z:600},data:{kind:'swarm_drop',dropId:'magnet'}});
  const entity=makeEntity(41), other=makeEntity(42), factory=createVisualFactory();
  const root=factory.build(entity), sibling=factory.build(other), tracker=createPickupMotionTracker();
  const body=root.getObjectByName('SwarmDropCrystal'), outer=root.children[2];
  const siblingBody=sibling.getObjectByName('SwarmDropCrystal');
  const material=body.material;
  assert.equal(material,siblingBody.material,'crystal material stays shared');
  const draw=(time, reducedMotion) => {
    tracker.updatePickupMotion(entity,root,time,0.05,null,{reducedMotion});
    setFactoryPresentationNow(time);
    body.onBeforeRender();
    return [body.rotation.y,outer.rotation.x];
  };
  try {
    draw(1,false);
    const paused=draw(1,false);
    assert.deepEqual(draw(1,false),paused,'unchanged simulation clock freezes draw callback');
    const quiet=draw(2,true);
    assert.deepEqual(draw(3,true),quiet,'reduced motion keeps crystal and ring still');
    tracker.updatePickupMotion(other,sibling,3,0.05,null,{reducedMotion:false});
    setFactoryPresentationNow(3); siblingBody.onBeforeRender();
    const siblingAngle=siblingBody.rotation.y;
    setFactoryPresentationNow(4); siblingBody.onBeforeRender();
    assert.notEqual(siblingBody.rotation.y,siblingAngle,'one reduced drop does not freeze another');
    assert.notDeepEqual(draw(4,false),quiet,'normal motion resumes');
    assert.equal(body.material,material);
  } finally { setFactoryPresentationNow(null); }
});
